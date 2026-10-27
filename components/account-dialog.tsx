"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getCloudServerSnapshot,
  getCloudSnapshot,
  refreshCloud,
  sendPasswordReset,
  signIn,
  signOut,
  signUp,
  subscribeCloud,
  updatePassword,
} from "@/lib/cloud";

export function AccountDialog() {
  const cloud = useSyncExternalStore(subscribeCloud, getCloudSnapshot, getCloudServerSnapshot);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageError, setMessageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const signedIn = cloud.auth.status === "signed-in";
  const recovery = cloud.auth.status === "signed-in" && cloud.auth.recovery;

  useEffect(() => {
    if (recovery) setOpen(true);
  }, [recovery]);

  function show(text: string, isError = false) {
    setMessage(text);
    setMessageError(isError);
  }

  async function onSignIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (result.error) show(result.error, true);
    else {
      setPassword("");
      show(result.notice ?? "Zalogowano.");
    }
  }

  async function onSignUp() {
    setBusy(true);
    const result = await signUp(email.trim(), password);
    setBusy(false);
    if (result.error) show(result.error, true);
    else {
      setPassword("");
      show(result.notice ?? "Konto utworzone.");
    }
  }

  async function onReset() {
    if (!email.trim()) {
      show("Najpierw wpisz adres e-mail.", true);
      return;
    }
    setBusy(true);
    const result = await sendPasswordReset(email.trim());
    setBusy(false);
    show(result.error ?? result.notice ?? "Sprawdź e-mail.", Boolean(result.error));
  }

  async function onNewPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await updatePassword(nextPassword);
    setBusy(false);
    if (result.error) show(result.error, true);
    else {
      setNextPassword("");
      show(result.notice ?? "Hasło zapisane.");
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 border-white/35 bg-white/10 font-semibold text-white hover:bg-white/20 hover:text-white"
        onClick={() => setOpen(true)}
      >
        {signedIn ? "Konto" : "Zaloguj"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{signedIn ? "Twoje konto" : "Zapis w Supabase"}</DialogTitle>
            <DialogDescription>
              {signedIn
                ? `${cloud.auth.status === "signed-in" ? cloud.auth.email : ""}. Trasy i ceny są przy tym koncie. Wylogowanie ukryje je w tej przeglądarce.`
                : "To samo konto co w Copy Paster. Bez logowania historia zostaje tylko w tej przeglądarce."}
            </DialogDescription>
          </DialogHeader>

          {recovery ? (
            <form className="grid gap-3" onSubmit={onNewPassword}>
              <div className="grid gap-1.5">
                <Label htmlFor="next-password">Nowe hasło</Label>
                <Input
                  id="next-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                Zapisz hasło
              </Button>
            </form>
          ) : null}

          {signedIn && !recovery ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" disabled={busy || cloud.syncing} onClick={() => void refreshCloud()}>
                Odśwież z konta
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void signOut().finally(() => setBusy(false));
                }}
              >
                Wyloguj
              </Button>
            </div>
          ) : null}

          {!signedIn ? (
            <form className="grid gap-3" onSubmit={onSignIn}>
              <div className="grid gap-1.5">
                <Label htmlFor="account-email">E-mail</Label>
                <Input
                  id="account-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="account-password">Hasło</Label>
                <Input
                  id="account-password"
                  type="password"
                  autoComplete="current-password"
                  minLength={6}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={busy}>
                  Zaloguj
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => void onSignUp()}>
                  Załóż konto
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => void onReset()}>
                  Nowe hasło
                </Button>
              </div>
            </form>
          ) : null}

          {message ? (
            <p role="status" className={messageError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {message}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
