import { PlanTier, PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // 1. Roles
  const userRole = await prisma.role.upsert({
    where: { name: RoleName.USER },
    update: {},
    create: { name: RoleName.USER, description: 'Standard extension user' },
  });
  const adminRole = await prisma.role.upsert({
    where: { name: RoleName.ADMIN },
    update: {},
    create: { name: RoleName.ADMIN, description: 'Full administrative access' },
  });

  // 2. Plans
  await prisma.plan.upsert({
    where: { tier: PlanTier.FREE },
    update: {},
    create: {
      tier: PlanTier.FREE,
      displayName: 'Free',
      dailyRequestLimit: 20,
      priceCents: 0,
    },
  });
  const premiumPlan = await prisma.plan.upsert({
    where: { tier: PlanTier.PREMIUM },
    update: {},
    create: {
      tier: PlanTier.PREMIUM,
      displayName: 'Premium',
      dailyRequestLimit: 500,
      priceCents: 999,
    },
  });

  // 3. First admin account (credentials come from .env)
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn(
      'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin user.',
    );
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: {},
      create: {
        email: adminEmail.toLowerCase(),
        passwordHash,
        fullName: 'System Admin',
        isEmailVerified: true,
        roleId: adminRole.id,
      },
    });
    await prisma.subscription.upsert({
      where: { userId: admin.id },
      update: {},
      create: { userId: admin.id, planId: premiumPlan.id },
    });
    console.log(`Admin ready: ${admin.email}`);
  }

  console.log(`Seeded roles (${userRole.name}, ${adminRole.name}) and plans.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
