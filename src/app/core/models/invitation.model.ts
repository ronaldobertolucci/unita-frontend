import { User } from './user.model';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface GroupDto {
  id: number;
  name: string;
  responsibleUser: User;
}

export interface GroupInvitation {
  id: number;
  group: GroupDto;
  invitedUser: User;
  status: InvitationStatus;
}