/**
 * PEZHWAN — Progressive profile service.
 *
 * Captures identity data incrementally so that sign-up stays frictionless while
 * compliance needs (email, phone, MFA enrollment) are gathered over time.
 */

export type ProgressiveStep = 'email' | 'phone' | 'mfa' | 'profile';

export interface ProgressiveProfileOptions {
  /** Fields already known at sign-up; these are skipped. */
  known?: ProgressiveStep[];
  /** Ordered prompts that should be completed before first login. */
  required?: ProgressiveStep[];
}

export interface ProfileStepStatus {
  step: ProgressiveStep;
  complete: boolean;
  required: boolean;
}

export class ProgressiveProfileService {
  private readonly required: ProgressiveStep[];
  private readonly known: Set<ProgressiveStep>;

  constructor(options: ProgressiveProfileOptions = {}) {
    this.known = new Set(options.known ?? []);
    this.required = options.required ?? ['email'];
  }

  status(completed: ProgressiveStep[]): ProfileStepStatus[] {
    const done = new Set([...this.known, ...completed]);
    return this.required.map((step) => ({
      step,
      complete: done.has(step),
      required: true,
    }));
  }

  nextStep(completed: ProgressiveStep[]): ProgressiveStep | null {
    for (const step of this.required) {
      if (!this.known.has(step) && !completed.includes(step)) return step;
    }
    return null;
  }
}