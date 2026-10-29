import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import {
  SignupPayloadSchema,
  LoginPayloadSchema,
  ForgotPasswordPayloadSchema,
  ResetPasswordPayloadSchema,
  VerifyEmailPayloadSchema,
  CurrentUser,
} from '@csi/shared';
import { Public, Authenticated, ReqUser } from '../../common/decorators/index.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';
import { generateSecureToken } from '../../common/crypto/tokens.js';
import { env } from '../../config/env.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /**
   * Issue CSRF token for client handshake
   */
  @Public()
  @Get('csrf')
  getCsrfToken(@Res({ passthrough: true }) res: Response): { csrfToken: string } {
    const csrfToken = generateSecureToken();
    const isProduction = env.NODE_ENV === 'production';

    res.cookie('csi_csrf', csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return { csrfToken };
  }

  /**
   * User Signup / Registration
   */
  @Public()
  @Post('signup')
  async signup(
    @Body() rawBody: unknown,
    @Req() req: Request,
  ) {
    const result = SignupPayloadSchema.safeParse(rawBody);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid signup payload',
        fields: result.error.flatten().fieldErrors,
      });
    }

    const ip = req.ip || 'unknown-ip';
    // Rate limit: 5 signups per 15 minutes per IP (SEC-05)
    this.rateLimiter.assertLimit(`signup:${ip}`, 5, 15 * 60 * 1000);

    return this.authService.signup(result.data, ip);
  }

  /**
   * Email Verification
   */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() rawBody: unknown, @Req() req: Request) {
    const result = VerifyEmailPayloadSchema.safeParse(rawBody);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid verification token payload',
        fields: result.error.flatten().fieldErrors,
      });
    }

    const ip = req.ip || 'unknown-ip';
    return this.authService.verifyEmail(result.data.token, ip);
  }

  /**
   * User Credentials Login (Argon2id + Session Cookie)
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() rawBody: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = LoginPayloadSchema.safeParse(rawBody);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid login payload',
        fields: result.error.flatten().fieldErrors,
      });
    }

    const ip = req.ip || 'unknown-ip';
    // Rate limit: 5 login attempts per 15 minutes per IP (SEC-05)
    this.rateLimiter.assertLimit(`login:${ip}`, 5, 15 * 60 * 1000);

    const userAgent = req.headers['user-agent'];
    const authResult = await this.authService.login(result.data, ip, userAgent);

    // Reset rate limit on successful credentials
    this.rateLimiter.reset(`login:${ip}`);

    const isProduction = env.NODE_ENV === 'production';

    // Set HttpOnly session cookie
    res.cookie('csi_session', authResult.sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      expires: authResult.expiresAt,
    });

    // Refresh CSRF cookie alongside session
    const csrfToken = generateSecureToken();
    res.cookie('csi_csrf', csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      message: 'Login successful',
      user: authResult.user,
      sessionToken: authResult.sessionToken, // Also return in response body for programmatic/mobile clients
    };
  }

  /**
   * Current Authenticated User Identity
   */
  @Authenticated()
  @Get('me')
  async me(@ReqUser() user: CurrentUser): Promise<CurrentUser> {
    return this.authService.me(user.id);
  }

  /**
   * Logout and Invalidate Active Session
   */
  @Authenticated()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @ReqUser() user: CurrentUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = (req as unknown as { sessionId?: string }).sessionId;
    const ip = req.ip || 'unknown-ip';

    await this.authService.logout(sessionId, user.id, ip);

    // Clear session and CSRF cookies
    res.clearCookie('csi_session', { path: '/' });
    res.clearCookie('csi_csrf', { path: '/' });

    return { message: 'Successfully logged out' };
  }

  /**
   * Forgot Password Request
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() rawBody: unknown, @Req() req: Request) {
    const result = ForgotPasswordPayloadSchema.safeParse(rawBody);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid forgot password payload',
        fields: result.error.flatten().fieldErrors,
      });
    }

    const ip = req.ip || 'unknown-ip';
    // Rate limit: 3 requests per hour per email/IP (SEC-06)
    this.rateLimiter.assertLimit(`forgot:${result.data.email}`, 3, 60 * 60 * 1000);

    return this.authService.forgotPassword(result.data.email, ip);
  }

  /**
   * Reset Password with Token
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() rawBody: unknown, @Req() req: Request) {
    const result = ResetPasswordPayloadSchema.safeParse(rawBody);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid reset password payload',
        fields: result.error.flatten().fieldErrors,
      });
    }

    const ip = req.ip || 'unknown-ip';
    return this.authService.resetPassword(result.data.token, result.data.new_password, ip);
  }
}
