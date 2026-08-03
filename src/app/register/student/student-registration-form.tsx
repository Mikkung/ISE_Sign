"use client";

import { useMemo, useState } from "react";
import { registerStudentAction } from "@/app/actions/auth";
import {
  STUDENT_EMAIL_ERROR,
  isValidStudentEmail,
  normalizeEmail,
  validateStudentPassword
} from "@/lib/student-registration";

export function StudentRegistrationForm({ error }: { error?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const emailError = email && !isValidStudentEmail(email) ? STUDENT_EMAIL_ERROR : "";
  const passwordResult = password ? validateStudentPassword(password) : { ok: true as const };
  const confirmError = confirmPassword && password !== confirmPassword ? "Password and confirmation password do not match." : "";

  return (
    <form action={registerStudentAction} className="mt-5 space-y-4">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Full Name</span>
        <input name="fullName" required minLength={2} maxLength={120} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Student Email</span>
        <input
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
        {emailError ? <span className="mt-1 block text-sm text-red-700">{emailError}</span> : null}
        {!emailError && normalizedEmail ? (
          <span className="mt-1 block text-xs text-slate-500">Registering with {normalizedEmail}</span>
        ) : null}
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
        {!passwordResult.ok ? <span className="mt-1 block text-sm text-red-700">{passwordResult.error}</span> : null}
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Confirm Password</span>
        <input
          name="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          minLength={8}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
        {confirmError ? <span className="mt-1 block text-sm text-red-700">{confirmError}</span> : null}
      </label>
      <button
        className="w-full rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white hover:bg-ise-maroonDark"
        disabled={Boolean(emailError || !passwordResult.ok || confirmError)}
      >
        Register with Student Email
      </button>
    </form>
  );
}
