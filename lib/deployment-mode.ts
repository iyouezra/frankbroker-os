export type FrankDeploymentMode = "demo" | "production";

/**
 * Demo remains the safe default. A live deployment must opt in explicitly so
 * missing environment configuration can never silently expose demo identities.
 */
export function deploymentMode(): FrankDeploymentMode {
  return process.env.FRANK_DEPLOYMENT_MODE === "production" ? "production" : "demo";
}

export function isInsecureDemoMode() {
  return deploymentMode() === "demo";
}

/** Investor headers are accepted only for the deliberately labelled demo UI. */
export function isInvestorDemoAuthEnabled() {
  return isInsecureDemoMode() && process.env.FRANK_INVESTOR_AUTH_MODE?.trim().toLowerCase() !== "otp";
}
