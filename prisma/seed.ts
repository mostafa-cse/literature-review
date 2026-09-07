/**
 * ==============================================================================
 * LITSPHERE ENTERPRISE DEVELOPMENT SEED SCRIPT (TypeScript / Prisma)
 * ==============================================================================
 */

import { PrismaClient, Role, ColumnType, PaperStatus, ScreeningDecision, ProjectRole } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export async function seed() {
  console.log('🌱 Starting TypeScript development seeding...');
  const defaultPasswordHash = hashPassword('Password123!');

  // Seed Admin User
  const admin = await prisma.user.upsert({
    where: { email: 'admin@litsphere.ac' },
    update: {},
    create: {
      name: 'System Administrator',
      username: 'admin',
      email: 'admin@litsphere.ac',
      passwordHash: defaultPasswordHash,
      role: Role.ADMIN,
      institution: 'Stanford AI Institute',
      bio: 'Principal platform architect.',
    },
  });

  // Seed Research Survey
  const survey = await prisma.project.upsert({
    where: { shareToken: 'survey_feature_selection_2026' },
    update: {},
    create: {
      ownerId: admin.id,
      name: 'Deep Analytical Benchmark on High-Dimensional Feature Selection',
      description: 'Systematic taxonomy and benchmark evaluating feature selection models.',
      domain: 'Machine Learning',
      isPublic: true,
      shareToken: 'survey_feature_selection_2026',
    },
  });

  console.log(`✅ TypeScript Seed complete. Admin ID: ${admin.id}, Survey ID: ${survey.id}`);
}

if (require.main === module) {
  seed()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
