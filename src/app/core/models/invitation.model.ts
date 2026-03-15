import { GroupDto } from './group.model';
import { User } from './user.model';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface GroupInvitation {
  id: number;
  group: GroupDto;
  invitedUser: User;
  status: InvitationStatus;
}

export interface CreateInvitationRequest {
  groupId: number;
  invitedUserEmail: string;
}