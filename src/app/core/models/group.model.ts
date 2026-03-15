import { User } from './user.model';

export interface GroupDto {
  id: number;
  name: string;
  responsibleUser: User;
}

export interface GroupMembership {
  id: number;
  user: User;
  group: GroupDto;
  joinedAt: string;
}

export interface CreateGroupRequest {
  name: string;
}

export interface UpdateGroupRequest {
  name: string;
}

export interface TransferResponsibilityRequest {
  newResponsibleUserId: number;
}