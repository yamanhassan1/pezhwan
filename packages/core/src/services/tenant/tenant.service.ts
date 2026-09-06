/**
 * PEZHWAN — Tenant service.
 *
 * CRUD + activation for multi-tenant isolation using the canonical tenant
 * model. All tenant-scoped reads flow through an explicit tenantId.
 */

import { TenantModel, type TenantDoc } from '../../models/index.ts';
import { ValidationError } from '@pezhwan/shared';

export interface CreateTenantInput {
  name: string;
  slug?: string;
  config?: Record<string, unknown>;
  applicationId?: string;
}

export class TenantService {
  async create(input: CreateTenantInput): Promise<TenantDoc> {
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw new ValidationError('A valid tenant name is required', 'INVALID_TENANT');
    const doc = await TenantModel.create({
      name: input.name,
      slug,
      config: input.config ?? {},
    });
    return {
      name: doc.name,
      slug: doc.slug,
      isActive: doc.isActive,
      config: doc.config,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async get(tenantId: string): Promise<TenantDoc | null> {
    return TenantModel.findById(tenantId);
  }

  async getBySlug(slug: string): Promise<TenantDoc | null> {
    return TenantModel.findOne({ slug });
  }

  async list(): Promise<TenantDoc[]> {
    return TenantModel.find().sort({ createdAt: -1 });
  }

  async update(tenantId: string, patch: Partial<Pick<TenantDoc, 'name' | 'config'>>): Promise<TenantDoc | null> {
    return TenantModel.findByIdAndUpdate(tenantId, { $set: patch }, { new: true });
  }

  async remove(tenantId: string): Promise<void> {
    await TenantModel.deleteOne({ _id: tenantId });
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}