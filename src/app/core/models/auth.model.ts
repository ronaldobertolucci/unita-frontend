import { UserDto } from './user.model';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  type: 'Bearer';
  expiresIn: number;
  user: UserDto;
}

export interface MessageResponse {
  message: string;
}

export interface PasswordResetRequest {
  token: string;
  newPassword: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  password: string;
}
