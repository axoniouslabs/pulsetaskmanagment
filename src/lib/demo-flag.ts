/**
 * The demo company (Crescent Distributors) is for sales demos and local testing.
 * It is off unless PULSE_DEMO=1. With it off, each deploy removes any demo data
 * left in the database (see scripts/predeploy.mjs).
 */
export const demoEnabled = () => process.env.PULSE_DEMO === "1";
