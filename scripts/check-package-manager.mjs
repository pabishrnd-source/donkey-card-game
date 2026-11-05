if (!process.env.npm_config_user_agent?.startsWith("pnpm/")) {
  console.error(
    "This workspace uses pnpm. Run pnpm install from the project root.",
  );
  process.exit(1);
}
