import { cloudChanges, mergeStores, priceToRow, routeToRow, storeFromRows } from "./fare-rows";
import { clearStore, getSnapshot, interpretSnapshot, saveStore } from "./storage";
import { authRedirectTo, getSupabase } from "./supabase";
import type { StoreData } from "./types";

const ACK_KEY = "krk-fare-tracker.cloud-ack";

export type CloudAuth =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; email: string; userId: string; recovery: boolean };

export type CloudSnapshot = {
  auth: CloudAuth;
  error: string | null;
  syncing: boolean;
};

export type AuthResult = { error?: string; notice?: string };

const serverSnapshot: CloudSnapshot = { auth: { status: "loading" }, error: null, syncing: false };
let snapshot: CloudSnapshot = serverSnapshot;
const listeners = new Set<() => void>();
let queue: Promise<void> = Promise.resolve();
let started = false;
let stopAuth: (() => void) | null = null;

export function subscribeCloud(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCloudSnapshot(): CloudSnapshot {
  return snapshot;
}

export function getCloudServerSnapshot(): CloudSnapshot {
  return serverSnapshot;
}

function emit(next: CloudSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function patch(partial: Partial<CloudSnapshot>) {
  emit({ ...snapshot, ...partial });
}

export function startCloudSync(): () => void {
  if (started) return () => undefined;
  const db = getSupabase();
  if (!db) {
    patch({ auth: { status: "signed-out" }, error: "Brak konfiguracji Supabase." });
    return () => undefined;
  }
  started = true;
  const { data } = db.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => {
      if (event === "SIGNED_OUT") {
        forgetAck();
        patch({ auth: { status: "signed-out" }, error: null, syncing: false });
        enqueue(async () => {
          clearStore();
        });
        return;
      }
      if (!session?.user) {
        patch({ auth: { status: "signed-out" } });
        return;
      }
      const recovery = event === "PASSWORD_RECOVERY" || (snapshot.auth.status === "signed-in" && snapshot.auth.recovery);
      patch({
        auth: {
          status: "signed-in",
          email: session.user.email ?? "zalogowano",
          userId: session.user.id,
          recovery,
        },
        error: null,
      });
      const replace = readAck() === session.user.id;
      void enqueue(() => syncAccount(replace));
    }, 0);
  });
  stopAuth = () => data.subscription.unsubscribe();
  const onVisible = () => {
    if (document.visibilityState !== "visible" || snapshot.auth.status !== "signed-in") return;
    void enqueue(() => syncAccount(readAck() != null));
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopAuth?.();
    stopAuth = null;
    document.removeEventListener("visibilitychange", onVisible);
    started = false;
  };
}

export function refreshCloud() {
  return enqueue(() => syncAccount(readAck() != null));
}

export function queuePersist(previous: StoreData, next: StoreData) {
  if (snapshot.auth.status !== "signed-in") return;
  const changes = cloudChanges(previous, next);
  if (
    changes.addedRoutes.length === 0 &&
    changes.removedRouteIds.length === 0 &&
    changes.updatedRoutes.length === 0 &&
    changes.addedLogs.length === 0 &&
    changes.removedLogIds.length === 0
  ) {
    return;
  }
  void enqueue(async () => {
    await persistChanges(changes);
  });
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const db = getSupabase();
  if (!db) return { error: "Brak konfiguracji Supabase." };
  const { error } = await db.auth.signInWithPassword({ email, password });
  return error ? { error: authMessage(error.message, error.code, error.status) } : { notice: "Zalogowano." };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const db = getSupabase();
  if (!db) return { error: "Brak konfiguracji Supabase." };
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirectTo() },
  });
  if (error) return { error: authMessage(error.message, error.code, error.status) };
  const alreadyRegistered = data.user != null && Array.isArray(data.user.identities) && data.user.identities.length === 0;
  if (alreadyRegistered) return { error: "Ten e-mail jest już zarejestrowany. Zaloguj się albo wyślij link do nowego hasła." };
  if (data.session) return { notice: "Konto utworzone." };
  return { notice: "Konto utworzone. Potwierdź je z maila, a potem się zaloguj." };
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const db = getSupabase();
  if (!db) return { error: "Brak konfiguracji Supabase." };
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: authRedirectTo() });
  if (error) return { error: authMessage(error.message, error.code, error.status) };
  return { notice: "Sprawdź e-mail i ustaw nowe hasło." };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const db = getSupabase();
  if (!db) return { error: "Brak konfiguracji Supabase." };
  const { error } = await db.auth.updateUser({ password });
  if (error) return { error: authMessage(error.message, error.code, error.status) };
  if (snapshot.auth.status === "signed-in") patch({ auth: { ...snapshot.auth, recovery: false } });
  return { notice: "Hasło zapisane." };
}

export async function signOut(): Promise<void> {
  const db = getSupabase();
  if (db) await db.auth.signOut();
}

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function syncAccount(replace: boolean) {
  const userId = snapshot.auth.status === "signed-in" ? snapshot.auth.userId : null;
  if (!getSupabase() || !userId) return;
  patch({ syncing: true });
  const localBefore = readLocal();
  const remote = await pullStore();
  if (!remote.ok) {
    forgetAck();
    patch({ syncing: false, error: remote.error });
    return;
  }
  if (!stillSignedIn(userId)) {
    patch({ syncing: false });
    return;
  }
  const during = cloudChanges(localBefore, readLocal());
  let base = remote.data;
  if (!replace) {
    const { merged, extraRoutes, extraLogs } = mergeStores(remote.data, localBefore);
    const uploaded = await insertRows(extraRoutes.map(routeToRow), extraLogs.map(priceToRow));
    if (!uploaded) return;
    base = merged;
  }
  const heldUpdates = cloudChanges(base, localBefore).updatedRoutes;
  const removedDuring = new Set(during.removedRouteIds);
  const updatedRoutes = new Map<string, ReturnType<typeof cloudChanges>["updatedRoutes"][number]>();
  for (const route of [...heldUpdates, ...during.updatedRoutes]) {
    if (!removedDuring.has(route.id)) updatedRoutes.set(route.id, route);
  }
  const pending = { ...during, updatedRoutes: [...updatedRoutes.values()] };
  const withHeld = applyChanges(base, {
    addedRoutes: [],
    removedRouteIds: [],
    addedLogs: [],
    removedLogIds: [],
    updatedRoutes: heldUpdates,
  });
  const withLocalEdits = applyChanges(withHeld, during);
  const savedEdits = await persistChanges(pending);
  if (!savedEdits || !stillSignedIn(userId)) {
    patch({ syncing: false });
    return;
  }
  saveStore(withLocalEdits);
  writeAck(userId);
  patch({ syncing: false, error: null });
}

async function persistChanges(changes: ReturnType<typeof cloudChanges>): Promise<boolean> {
  const db = getSupabase();
  if (!db || snapshot.auth.status !== "signed-in") return false;
  patch({ syncing: true, error: null });
  if (changes.removedLogIds.length > 0) {
    const { error } = await db.from("fare_prices").delete().in("id", changes.removedLogIds);
    if (error) return failPersist(error.message);
  }
  if (changes.removedRouteIds.length > 0) {
    const { error } = await db.from("fare_routes").delete().in("id", changes.removedRouteIds);
    if (error) return failPersist(error.message);
  }
  for (const route of changes.updatedRoutes) {
    const updated = await updateRoute(route);
    if (!updated) return false;
  }
  const inserted = await insertRows(changes.addedRoutes.map(routeToRow), changes.addedLogs.map(priceToRow));
  if (!inserted) return false;
  if (snapshot.auth.status === "signed-in") writeAck(snapshot.auth.userId);
  patch({ syncing: false });
  return true;
}

async function insertRows(
  routes: ReturnType<typeof routeToRow>[],
  prices: ReturnType<typeof priceToRow>[],
): Promise<boolean> {
  const db = getSupabase();
  if (!db) return failPersist("Brak konfiguracji Supabase.");
  if (routes.length > 0) {
    const { error } = await db.from("fare_routes").insert(routes);
    if (error) return failPersist(error.message);
  }
  if (prices.length > 0) {
    const { error } = await db.from("fare_prices").insert(prices);
    if (error) return failPersist(error.message);
  }
  return true;
}

async function updateRoute(route: Parameters<typeof routeToRow>[0]): Promise<boolean> {
  const db = getSupabase();
  if (!db) return failPersist("Brak konfiguracji Supabase.");
  const { id, created_at: createdAt, ...fields } = routeToRow(route);
  void createdAt;
  const hadTimes = Boolean(fields.outbound_depart || fields.outbound_arrive || fields.return_depart || fields.return_arrive);
  let { data, error } = await db.from("fare_routes").update(fields).eq("id", id).select("id");
  if (error && missingTimeColumn(error.message)) {
    const dates = { ...fields };
    delete dates.outbound_depart;
    delete dates.outbound_arrive;
    delete dates.return_depart;
    delete dates.return_arrive;
    const retry = await db.from("fare_routes").update(dates).eq("id", id).select("id");
    if (!retry.error && hadTimes) return failPersist(error.message);
    data = retry.data;
    error = retry.error;
  }
  if (error) return failPersist(error.message);
  if (!data || data.length === 0) {
    return failPersist("permission denied for table fare_routes");
  }
  return true;
}

function missingTimeColumn(message: string) {
  return /outbound_depart|outbound_arrive|return_depart|return_arrive/i.test(message) && /schema cache|does not exist|column/i.test(message);
}

function failPersist(message: string): false {
  forgetAck();
  patch({ syncing: false, error: dbMessage(message) });
  return false;
}

function stillSignedIn(userId: string) {
  return snapshot.auth.status === "signed-in" && snapshot.auth.userId === userId;
}

function readLocal(): StoreData {
  const view = interpretSnapshot(getSnapshot());
  return view.status === "ready" ? view.data : { routes: [], logs: [] };
}

function applyChanges(data: StoreData, changes: ReturnType<typeof cloudChanges>): StoreData {
  const removedRoutes = new Set(changes.removedRouteIds);
  const removedLogs = new Set(changes.removedLogIds);
  const updatedRoutes = new Map(changes.updatedRoutes.map((route) => [route.id, route]));
  const routes = [
    ...data.routes
      .filter((route) => !removedRoutes.has(route.id))
      .map((route) => updatedRoutes.get(route.id) ?? route),
    ...changes.addedRoutes.filter((route) => data.routes.every((existing) => existing.id !== route.id)),
  ];
  const routeIds = new Set(routes.map((route) => route.id));
  const logs = [
    ...data.logs.filter((log) => !removedLogs.has(log.id) && !removedRoutes.has(log.routeId) && routeIds.has(log.routeId)),
    ...changes.addedLogs.filter((log) => routeIds.has(log.routeId) && data.logs.every((existing) => existing.id !== log.id)),
  ];
  return { routes, logs };
}

async function pullStore(): Promise<{ ok: true; data: StoreData } | { ok: false; error: string }> {
  const db = getSupabase();
  if (!db) return { ok: false, error: "Brak konfiguracji Supabase." };
  const routeColumns = "id, destination_iata, outbound_from, outbound_to, return_date, created_at";
  const routesWithTimes = await db
    .from("fare_routes")
    .select(`${routeColumns}, outbound_depart, outbound_arrive, return_depart, return_arrive`);
  const routes = routesWithTimes.error && missingTimeColumn(routesWithTimes.error.message)
    ? await db.from("fare_routes").select(routeColumns)
    : routesWithTimes;
  const [prices] = await Promise.all([
    db
      .from("fare_prices")
      .select(
        "id, route_id, airline, amount, currency, checked_on, outbound_depart, outbound_arrive, return_depart, return_arrive, created_at",
      ),
  ]);
  if (routes.error) return { ok: false, error: dbMessage(routes.error.message) };
  if (prices.error) return { ok: false, error: dbMessage(prices.error.message) };
  return { ok: true, data: storeFromRows(routes.data ?? [], prices.data ?? []) };
}

function readAck(): string | null {
  try {
    return localStorage.getItem(ACK_KEY);
  } catch {
    return null;
  }
}

function writeAck(userId: string) {
  try {
    localStorage.setItem(ACK_KEY, userId);
  } catch {
    // The account copy is already saved. The next sync will merge again.
  }
}

function forgetAck() {
  try {
    localStorage.removeItem(ACK_KEY);
  } catch {
    // Ignore a blocked storage area. The banner still reports the sync error.
  }
}

function dbMessage(message: string): string {
  if (/permission denied|row-level security|42501/i.test(message)) {
    return "Żeby zmienić zapisaną trasę na koncie, uruchom raz skrypt supabase/allow-edits.sql w SQL Editor. Zmiana zostaje w tej przeglądarce.";
  }
  if (missingTimeColumn(message)) {
    return "Żeby zapisać godziny trasy na koncie, uruchom raz skrypt supabase/allow-edits.sql w SQL Editor. Zmiana zostaje w tej przeglądarce.";
  }
  if (/fare_routes|fare_prices|schema cache|does not exist/i.test(message)) {
    return "W Supabase nie ma jeszcze tabel cen. Uruchom raz skrypt supabase/schema.sql w SQL Editor.";
  }
  return "Nie udało się zapisać na koncie. Zostaje kopia w tej przeglądarce.";
}

function authMessage(message: string, code?: string, status?: number): string {
  if (code === "invalid_credentials" || /invalid login/i.test(message)) return "Nieprawidłowy e-mail lub hasło.";
  if (code === "email_not_confirmed") return "Potwierdź konto z maila, potem się zaloguj.";
  if (status === 429 || code === "over_email_send_rate_limit") {
    return "Supabase wstrzymał wysyłkę maili na chwilę. Sprawdź skrzynkę i spróbuj później.";
  }
  return message;
}
