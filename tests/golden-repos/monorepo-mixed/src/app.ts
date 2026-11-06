// Golden fixture: dpdpa.javascript.pii-in-logs must report DPDPA-8.4-LOG-01.
export function handleRequest(email: string): void {
  console.log('user email', email);
}
