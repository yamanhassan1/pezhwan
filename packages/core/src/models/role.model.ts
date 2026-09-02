/**
 * PEZHWAN — Role & Permission models (RBAC).
 *
 * Roles are named collections of permissions scoped to a tenant + application.
 * SSO/enterprise use-cases can extend with client-role mapping later.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

// --- Permission -------------------------------------------------------------

export interface PermissionDoc {
  tenantId: string;
  applicationId: string;
  name: string; // "{resource}:{action}"
  resource: string;
  action: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const permissionSchema = new Schema<PermissionDoc>(
  {
    tenantId: { type: String, required: true },
    applicationId: { type: String, required: true },
    name: { type: String, required: true },
    resource: { type: String, required: true },
    action: { type: String, required: true },
    description: { type: String },
  },
  { timestamps: true, versionKey: false },
);

permissionSchema.index(
  { tenantId: 1, applicationId: 1, name: 1 },
  { unique: true },
);

export const PermissionModel: Model<PermissionDoc> =
  (models.Permission as Model<PermissionDoc>) ||
  model<PermissionDoc>('Permission', permissionSchema);

// --- Role -------------------------------------------------------------------

export interface RoleDoc {
  tenantId: string;
  applicationId: string;
  name: string; // e.g. 'ADMIN' | 'CAPTAIN' | 'RIDER'
  description?: string;
  permissionIds: string[];
  isSystem?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<RoleDoc>(
  {
    tenantId: { type: String, required: true },
    applicationId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    permissionIds: [{ type: String, default: [] }],
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

roleSchema.index(
  { tenantId: 1, applicationId: 1, name: 1 },
  { unique: true },
);

export const RoleModel: Model<RoleDoc> =
  (models.Role as Model<RoleDoc>) || model<RoleDoc>('Role', roleSchema);

// --- User role assignment ----------------------------------------------------

export interface UserRoleAssignmentDoc {
  userId: string;
  tenantId: string;
  applicationId: string;
  roleId: string;
  assignedAt: Date;
}

const userRoleAssignmentSchema = new Schema<UserRoleAssignmentDoc>(
  {
    userId: { type: String, required: true },
    tenantId: { type: String, required: true },
    applicationId: { type: String, required: true },
    roleId: { type: String, required: true },
    assignedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

userRoleAssignmentSchema.index(
  { userId: 1, tenantId: 1, applicationId: 1, roleId: 1 },
  { unique: true },
);
userRoleAssignmentSchema.index({ roleId: 1 });

export const UserRoleAssignmentModel: Model<UserRoleAssignmentDoc> =
  (models.UserRoleAssignment as Model<UserRoleAssignmentDoc>) ||
  model<UserRoleAssignmentDoc>('UserRoleAssignment', userRoleAssignmentSchema);