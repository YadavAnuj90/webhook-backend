// Temporary type stub — replace by running: npm install passport-google-oauth20 @types/passport-google-oauth20
declare module 'passport-google-oauth20' {
  import { Strategy as PassportStrategy } from 'passport';
  export type VerifyCallback = (err: any, user?: any, info?: any) => void;
  export class Strategy extends PassportStrategy {
    constructor(options: {
      clientID: string;
      clientSecret: string;
      callbackURL: string;
      scope?: string[];
    }, verify: (accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) => void);
  }
}
