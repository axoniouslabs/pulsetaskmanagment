/**
 * Load the demo company into the database.
 *
 *   npm run db:seed            create it if it isn't there yet
 *   npm run db:seed -- --reset wipe the demo organisation and load it fresh
 */
process.env.TZ = "Asia/Karachi";
import "dotenv/config";
import { seedDemo } from "@/server/demo";

seedDemo({ reset: process.argv.includes("--reset") })
  .then((msg) => {
    console.log(msg);
    console.log("Sign in as imran@crescent.pk (owner), saad@crescent.pk (manager) or ali@crescent.pk (employee) with SEED_PASSWORD.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
