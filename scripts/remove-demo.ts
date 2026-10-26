/**
 * Remove the demo company (Crescent Distributors) and its sign-ins.
 * Runs on every deploy while PULSE_DEMO isn't "1"; does nothing if it's gone.
 *
 *   npm run db:remove-demo
 */
import "dotenv/config";
import { removeDemo } from "@/server/demo";

removeDemo()
  .then((msg) => {
    console.log(msg);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
