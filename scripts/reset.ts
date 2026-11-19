import { execSync } from "node:child_process";

execSync("npm run db:migrate", { stdio: "inherit" });
execSync("npm run db:seed -- --force", { stdio: "inherit" });
