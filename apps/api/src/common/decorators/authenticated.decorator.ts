import { SetMetadata } from '@nestjs/common';

export const IS_AUTHENTICATED_KEY = 'isAuthenticated';
export const Authenticated = () => SetMetadata(IS_AUTHENTICATED_KEY, true);
