#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_DIR = path.join(__dirname, '../apps/admin/src');

// Маппинг старых путей на новые
const importMappings = {
  '@/shared/ui/button': 'sunday-sauna/ui',
  '@/shared/ui/card': 'sunday-sauna/ui',
  '@/shared/ui/input': 'sunday-sauna/ui',
  '@/shared/ui/label': 'sunday-sauna/ui',
  '@/shared/ui/form': 'sunday-sauna/ui',
  '@/shared/ui/dialog': 'sunday-sauna/ui',
  '@/shared/ui/alert-dialog': 'sunday-sauna/ui',
  '@/shared/ui/dropdown-menu': 'sunday-sauna/ui',
  '@/shared/ui/select': 'sunday-sauna/ui',
  '@/shared/ui/table': 'sunday-sauna/ui',
  '@/shared/ui/checkbox': 'sunday-sauna/ui',
  '@/shared/ui/badge': 'sunday-sauna/ui',
  '@/shared/ui/skeleton': 'sunday-sauna/ui',
  '@/shared/ui/separator': 'sunday-sauna/ui',
  '@/shared/ui/avatar': 'sunday-sauna/ui',
  '@/shared/ui/data-table': 'sunday-sauna/ui',
  '@/shared/ui/sonner': 'sunday-sauna/ui',
  '@/shared/ui/textarea': 'sunday-sauna/ui',
  '@/shared/ui/tabs': 'sunday-sauna/ui',
};

function replaceImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Заменяем импорты
  for (const [oldPath, newPath] of Object.entries(importMappings)) {
    // Паттерн для поиска импортов
    const patterns = [
      // import { X } from "oldPath"
      new RegExp(`from\\s+["']${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'g'),
      // import X from "oldPath"
      new RegExp(`import\\s+\\w+\\s+from\\s+["']${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'g'),
    ];

    patterns.forEach(pattern => {
      if (pattern.test(content)) {
        content = content.replace(pattern, (match) => {
          return match.replace(oldPath, newPath);
        });
        modified = true;
      }
    });
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Обновлен: ${filePath.replace(APP_DIR, '')}`);
    return true;
  }
  return false;
}

function findFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory() && !filePath.includes('node_modules') && !filePath.includes('.next')) {
      findFiles(filePath, fileList);
    } else if ((file.endsWith('.ts') || file.endsWith('.tsx')) && !filePath.includes('node_modules')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function main() {
  console.log('🔄 Начало миграции импортов UI компонентов...\n');

  const files = findFiles(APP_DIR);
  let updatedCount = 0;

  files.forEach(file => {
    if (replaceImportsInFile(file)) {
      updatedCount++;
    }
  });

  console.log(`\n✅ Миграция завершена! Обновлено файлов: ${updatedCount}`);
  console.log('\n⚠️  ВАЖНО: Проверьте файлы вручную и убедитесь, что все импорты корректны!');
}

main();
