/**
 * PEZHWAN — Team service.
 *
 * Team membership management within organizations.
 */

import { TeamModel, type TeamDoc } from '../../models/team.model.ts';
import { OrganizationModel } from '../../models/organization.model.ts';
import { ValidationError } from '@pezhwan/shared';

export interface CreateTeamInput {
  name: string;
  organizationId: string;
  tenantId?: string;
}

export class TeamService {
  async create(input: CreateTeamInput): Promise<TeamDoc> {
    const organization = await OrganizationModel.findById(input.organizationId);
    if (!organization) throw new ValidationError('Organization not found', 'ORG_NOT_FOUND');
    return TeamModel.create({
      name: input.name,
      organizationId: input.organizationId,
      tenantId: input.tenantId ?? organization.tenantId,
      memberIds: [],
      roleIds: [],
    });
  }

  async listByOrganization(organizationId: string): Promise<TeamDoc[]> {
    return TeamModel.find({ organizationId });
  }

  async addMember(teamId: string, userId: string): Promise<TeamDoc | null> {
    return TeamModel.findByIdAndUpdate(
      teamId,
      { $addToSet: { memberIds: userId } },
      { new: true },
    );
  }

  async removeMember(teamId: string, userId: string): Promise<TeamDoc | null> {
    return TeamModel.findByIdAndUpdate(teamId, { $pull: { memberIds: userId } }, { new: true });
  }

  async remove(teamId: string): Promise<void> {
    await TeamModel.deleteOne({ _id: teamId });
  }
}