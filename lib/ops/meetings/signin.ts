/** Called only after the server's private workspace allowlist and cooldown pass. */
type ProviderError={code?:string;status?:number};
type Result={error:ProviderError|null};
export async function sendMeetingSignIn(email:string,origin:string,provider:{invite:(email:string,redirectTo:string)=>Promise<Result>;signIn:(email:string,redirectTo:string)=>Promise<Result>}){
 // Unconfirmed identities are treated as signups by the magic-link endpoint.
 // Invitation-only projects therefore need an administrator invitation first.
 const invited=await provider.invite(email,origin+'/ops/auth/complete?next=/ops/meetings');
 if(!invited.error)return 'invitation' as const;
 if(invited.error.code!=='email_exists')throw invited.error;
 const signedIn=await provider.signIn(email,origin+'/gic/auth/callback');
 if(signedIn.error)throw signedIn.error;
 return 'sign-in' as const;
}
export function meetingEmailFailure(error:ProviderError){
 if(error.code==='email_address_not_authorized')return 'The email provider is not configured to deliver to this staff address. Your administrator needs to activate staff email delivery.';
 if(['over_email_send_rate_limit','over_request_rate_limit','email_send_rate_limit_exceeded'].includes(error.code||''))return 'The identity service has limited email requests. Wait a few minutes before requesting another link.';
 return 'The identity service could not send the access email. Your account has not been verified. Please ask your administrator to check email delivery.';
}
