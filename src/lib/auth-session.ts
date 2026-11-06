let token: string | undefined;
export const getCsrfToken = () => token;
export const setCsrfToken = (value?: string) => {
  token = value;
};
export function authenticationExpired() {
  setCsrfToken();
  window.dispatchEvent(new Event("zhixu-auth-expired"));
}
