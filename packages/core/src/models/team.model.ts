/**
 * PEZHWAN — Team model (role groups within an organization).
 */
import mongoose from 'mongoose';
import type { Model } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface TeamDoc {
  name: string;
  organizationId?: string;
  tenantId?: string;
  memberIds: string[];
  roleIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<TeamDoc>(
  {
    name: { type: String, required: true, trim: true },
    organizationId: { type: String, index: true },
    tenantId: { type: String, index: true },
    memberIds: { type: [String], default: [] },
    roleIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const TeamModel: Model<TeamDoc> =
  (models.Team as Model<TeamDoc>) ?? model<TeamDoc>('Team', TeamSchema);