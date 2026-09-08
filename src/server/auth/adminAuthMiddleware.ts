import { Request, Response, NextFunction } from 'express';
import { SupabaseRestClient } from '../../core/persistence/SupabaseRestClient';

export interface AuthenticatedAdminRequest extends Request {
  adminUser?: {
    id: string;
    email: string;
    authMethod: 'supabase_jwt' | 'secret_key';
  };
}

/**
 * Admin authentication middleware.
 * Supports both:
 * 1. Bearer <Supabase_JWT> (verified via Supabase Auth and checked against ADMIN_EMAILS whitelist)
 * 2. x-admin-key: <SERA_ADMIN_SECRET> (developer / emergency key)
 */
export function createAdminAuthMiddleware(supabaseClient?: SupabaseRestClient | null) {
  const getAdminSecret = () => process.env.SERA_ADMIN_SECRET || 'sera-admin-master-key-2026';
  const getAdminEmails = () => {
    const raw = process.env.ADMIN_EMAILS || 'seraos.agent@gmail.com,setaraindonesia45@gmail.com,admin@seraos.xyz';
    return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  };

  return async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction): Promise<void> => {
    const adminSecret = getAdminSecret();
    const adminEmails = getAdminEmails();

    // 1. Check direct x-admin-key header
    const providedKey = req.headers['x-admin-key'] as string;
    if (providedKey && providedKey.trim() === adminSecret) {
      req.adminUser = {
        id: 'master-admin',
        email: 'admin@seraos.xyz',
        authMethod: 'secret_key'
      };
      return next();
    }

    // 2. Check Authorization Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();

      // Check if bearer token matches direct secret key as well
      if (token === adminSecret) {
        req.adminUser = {
          id: 'master-admin',
          email: 'admin@seraos.xyz',
          authMethod: 'secret_key'
        };
        return next();
      }

      if (supabaseClient) {
        try {
          const authUser = await supabaseClient.getAuthenticatedUser(token);
          const email = (authUser.email || '').toLowerCase();

          // Check against authorized email whitelist (or allow if whitelist has wildcard '*')
          const isAuthorized = adminEmails.includes('*') || adminEmails.includes(email);

          if (!isAuthorized) {
            res.status(403).json({
              error: 'Forbidden',
              message: `Email ${email || 'unknown'} is not authorized for Admin Control Tower access.`
            });
            return;
          }

          req.adminUser = {
            id: authUser.id,
            email: email || 'unknown',
            authMethod: 'supabase_jwt'
          };
          return next();
        } catch (err: any) {
          res.status(401).json({
            error: 'Unauthorized',
            message: err.message || 'Invalid or expired Supabase authentication session.'
          });
          return;
        }
      }
    }

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Admin credentials. Provide Authorization Bearer token or x-admin-key.'
    });
  };
}
