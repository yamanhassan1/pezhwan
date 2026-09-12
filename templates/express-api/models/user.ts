import { Schema, model, models, type InferSchemaType } from 'mongoose';

/**
 * Optional app-level user document. The auth layer persists users through
 * @pezhwan/core's own UserModel; this schema exists to hold application
 * profile fields alongside the accounts it manages.
 */
const appUserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    displayName: { type: String, default: '' },
    plan: { type: String, default: 'free' },
  },
  { timestamps: true },
);

export type AppUser = InferSchemaType<typeof appUserSchema>;

export const AppUserModel = (models.AppUser ?? model('AppUser', appUserSchema)) as ReturnType<
  typeof model<typeof appUserSchema>
>;