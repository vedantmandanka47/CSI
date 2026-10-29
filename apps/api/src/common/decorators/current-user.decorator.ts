import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CurrentUser } from '@csi/shared';

export const ReqUser = createParamDecorator(
  (data: keyof CurrentUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUser | undefined;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
