/** User projection used by existing group and invitation views. */
export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
}

/** Complete public user returned by authentication endpoints. */
export interface UserDto extends User {
  enabled: boolean;
  emailVerified: boolean;
  roles: string[];
}
