"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { defaultStudentWorkflow, labelForWorkflowRole, validateStudentWorkflow, type StudentWorkflowStepInput, type WorkflowProfileOption, type WorkflowStepRole } from "@/lib/student-workflow";

function SaveWorkflowButton({ locked }: { locked: boolean }) {
  const { pending } = useFormStatus();
  const disabled = locked || pending;

  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
    >
      {pending ? "Saving..." : "Save Workflow"}
    </button>
  );
}

function labelForOption(option: WorkflowProfileOption) {
  return `${option.displayName}${option.position ? ` - ${option.position}` : ""}`;
}

export function StudentWorkflowEditor({
  action,
  initialSteps,
  profiles,
  locked,
  lockReason
}: {
  action: (formData: FormData) => void;
  initialSteps: StudentWorkflowStepInput[];
  profiles: WorkflowProfileOption[];
  locked: boolean;
  lockReason?: string;
}) {
  const [steps, setSteps] = useState<StudentWorkflowStepInput[]>(initialSteps.length > 0 ? initialSteps : defaultStudentWorkflow());
  const [intent, setIntent] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const workflowJson = useMemo(() => JSON.stringify(steps), [steps]);

  function optionsForRole(role: WorkflowStepRole) {
    return profiles.filter((profile) => profile.isActive && profile.role === role);
  }

  function updateStep(index: number, patch: Partial<StudentWorkflowStepInput>) {
    setIntent("");
    setClientError(null);
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  }

  function addStep() {
    setIntent("");
    setClientError(null);
    setSteps((current) => [
      ...current,
      {
        name: "Approval Step",
        role: "staff",
        selectionMode: "any_active_role",
        approverIds: [],
        completionRule: "any",
        minimumApprovals: null,
        requiresSignature: false,
        dueAt: null
      }
    ]);
  }

  function move(index: number, direction: -1 | 1) {
    setIntent("");
    setClientError(null);
    setSteps((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(index: number) {
    setIntent("");
    setClientError(null);
    setSteps((current) => current.length <= 1 ? current : current.filter((_, stepIndex) => stepIndex !== index));
  }

  function restoreDefault() {
    setIntent("restore_default");
    setClientError(null);
    setSteps(defaultStudentWorkflow());
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (locked) {
      event.preventDefault();
      return;
    }

    const validation = validateStudentWorkflow({
      requesterId: "",
      steps,
      profiles
    });

    if (!validation.ok) {
      event.preventDefault();
      setClientError(validation.message);
    }
  }

  return (
    <section className="space-y-4">
      {locked ? (
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {lockReason ?? "The workflow can no longer be edited because approval has started."}
        </p>
      ) : null}
      {clientError ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{clientError}</p>
      ) : null}
      <form action={action} onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="workflowJson" value={workflowJson} />
        <input type="hidden" name="intent" value={intent} />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={locked} onClick={addStep} className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
            Add Approval Step
          </button>
          <button type="button" disabled={locked} onClick={restoreDefault} className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
            Restore Default Workflow
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => {
            const roleOptions = optionsForRole(step.role);
            const roleLabel = labelForWorkflowRole(step.role);
            const poolLabel = `Any Active ${roleLabel} (${roleOptions.length})`;

            return (
              <div key={`${step.id ?? "new"}-${index}`} className="rounded border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-950">Step {index + 1}</h3>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={locked || index === 0} onClick={() => move(index, -1)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">
                      Move Up
                    </button>
                    <button type="button" disabled={locked || index === steps.length - 1} onClick={() => move(index, 1)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">
                      Move Down
                    </button>
                    <button type="button" disabled={locked || steps.length <= 1} onClick={() => remove(index)} className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-50">
                      Remove Step
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Step name</span>
                    <input disabled={locked} value={step.name} onChange={(event) => updateStep(index, { name: event.target.value })} className="w-full rounded border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Role type</span>
                    <select
                      disabled={locked}
                      value={step.role}
                      onChange={(event) => updateStep(index, { role: event.target.value as WorkflowStepRole, selectionMode: "any_active_role", approverIds: [] })}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    >
                      <option value="staff">Staff</option>
                      <option value="approver">Faculty Approver</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Approver dropdown</span>
                    <select
                      disabled={locked}
                      value={step.selectionMode}
                      onChange={(event) => updateStep(index, { selectionMode: event.target.value as "any_active_role" | "specific_users", approverIds: [] })}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    >
                      <option value="any_active_role">{poolLabel}</option>
                      <option value="specific_users">Specific people</option>
                    </select>
                  </label>
                  {step.selectionMode === "specific_users" ? (
                    <label className="space-y-1 text-sm lg:col-span-2">
                      <span className="font-medium text-slate-700">Specific approvers</span>
                      <select
                        multiple
                        disabled={locked}
                        value={step.approverIds}
                        onChange={(event) => updateStep(index, { approverIds: Array.from(event.target.selectedOptions).map((option) => option.value) })}
                        className="h-28 w-full rounded border border-slate-300 px-3 py-2"
                      >
                        {roleOptions.map((option) => (
                          <option key={option.id} value={option.id}>{labelForOption(option)}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Completion rule</span>
                    <select
                      disabled={locked}
                      value={step.completionRule}
                      onChange={(event) => updateStep(index, { completionRule: event.target.value as StudentWorkflowStepInput["completionRule"] })}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    >
                      <option value="any">Any one</option>
                      <option value="all">All selected</option>
                      <option value="minimum">Minimum number</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Signature Required</span>
                    <select
                      disabled={locked}
                      value={step.requiresSignature ? "true" : "false"}
                      onChange={(event) => updateStep(index, { requiresSignature: event.target.value === "true" })}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    >
                      <option value="false">No signature required</option>
                      <option value="true">Signature required</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Minimum approvals</span>
                    <input
                      disabled={locked || step.completionRule !== "minimum"}
                      type="number"
                      min={1}
                      value={step.minimumApprovals ?? ""}
                      onChange={(event) => updateStep(index, { minimumApprovals: Number(event.target.value) || null })}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Due date, optional</span>
                    <input
                      disabled={locked}
                      type="date"
                      value={step.dueAt ?? ""}
                      onChange={(event) => updateStep(index, { dueAt: event.target.value || null })}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <section className="rounded border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-950">Workflow Preview</h3>
          <ol className="mt-3 space-y-2 text-sm text-slate-700">
            {steps.map((step, index) => {
              const count = step.selectionMode === "any_active_role" ? optionsForRole(step.role).length : step.approverIds.length;
              const group = `active ${labelForWorkflowRole(step.role)}`;
              const behavior = step.selectionMode === "any_active_role"
                ? `${step.completionRule === "all" ? "All" : step.completionRule === "minimum" ? `${step.minimumApprovals ?? 1} of` : "Any one of"} ${count} ${group} may approve`
                : step.completionRule === "all"
                  ? `${count} selected approver${count === 1 ? "" : "s"} must approve`
                  : step.completionRule === "minimum"
                    ? `${step.minimumApprovals ?? 1} of ${count} selected approvers must approve`
                    : `Any one of ${count} selected approvers may approve`;
              return <li key={`${step.name}-${index}`}>{index + 1}. {step.name}: {behavior}{step.requiresSignature ? "; signature required" : ""}</li>;
            })}
          </ol>
        </section>

        <div className="flex justify-end">
          <SaveWorkflowButton locked={locked} />
        </div>
      </form>
    </section>
  );
}
