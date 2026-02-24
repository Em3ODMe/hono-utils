import { MiddlewareHandler } from 'hono';

type MiddlewareWithLoggingCapabilityProps<
  RestProps extends Record<string, unknown>,
> = {
  useLogger?: boolean;
} & RestProps;

export interface MiddlewareWithLoggingCapability<
  RestProps extends Record<string, unknown>,
> {
  (props?: MiddlewareWithLoggingCapabilityProps<RestProps>): MiddlewareHandler;
}
