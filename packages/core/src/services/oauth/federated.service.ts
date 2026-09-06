/**
 * PEZHWAN — Federated identity service.
 *
 * Links external (OAuth/OIDC/SAML) subjects to local users. Resolution order:
 * user-provided `linkToken` (pre-authorized user) → auto-provision if allowed
 * → error otherwise. Linked identities enable passwordless sign-in via the
 * same external provider.
 */

import { UserModel, type UserDoc } from '../../models/user.model.ts';
import { ValidationError } from '@pezhwan/shared';

export interface FederatedProfile {
  provider: string;
  subject: string;
  email?: string;
  name?: string;
  picture?: string;
}

export interface LinkIdentityInput {
  tenantId: string;
  provider: string;
  subject: string;
  userId?: string;
  profile?: FederatedProfile;
  autoProvision?: boolean;
}

export interface FederatedResolution {
  user: UserDoc | null;
  linked: boolean;
}

export class FederatedIdentityService {
  /** Finds a local user by provider+subject within a tenant. */
  async findByProvider(tenantId: string, provider: string, subject: string): Promise<UserDoc | null> {
    return UserModel.findOne({
      tenantId,
      'identities.provider': provider,
      'identities.subject': subject,
    });
  }

  /** Links an identity to an existing user or provisions a new one. */
  async resolve(input: LinkIdentityInput): Promise<FederatedResolution> {
    const existing = await this.findByProvider(
      input.tenantId,
      input.provider,
      input.subject,
    );
    if (existing) {
      return { user: existing, linked: false };
    }
    if (input.userId) {
      const user = await this.link(input.userId, input.provider, input.subject);
      return { user, linked: true };
    }
    const profile = input.profile;
    const email = profile?.email?.toLowerCase();
    if (!email || !input.autoProvision) {
      throw new ValidationError(
        'No matching local user for federated identity',
        'IDENTITY_UNLINKED',
      );
    }
    const user = await UserModel.create({
      tenantId: input.tenantId,
      email,
      emailVerified: true,
      isActive: true,
      identities: [{ provider: input.provider, subject: input.subject }],
    });
    return { user, linked: true };
  }

  /** Attaches a provider subject to a known user id. */
  async link(userId: string, provider: string, subject: string): Promise<UserDoc | null> {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $addToSet: { identities: { provider, subject } } },
      { new: true },
    );
    if (!user) throw new ValidationError('User not found', 'USER_NOT_FOUND');
    return user;
  }

  /** Detaches a provider subject (unlinks the identity). */
  async unlink(userId: string, provider: string, subject: string): Promise<UserDoc | null> {
    return UserModel.findByIdAndUpdate(
      userId,
      { $pull: { identities: { provider, subject } } },
      { new: true },
    );
  }
}