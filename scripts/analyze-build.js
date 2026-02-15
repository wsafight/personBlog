#!/usr/bin/env node

/**
 * 构建产物分析脚本
 * 使用方法: node scripts/analyze-build.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '../dist')

// 获取文件大小（字节）
function getFileSize(filePath) {
  const stats = fs.statSync(filePath)
  return stats.size
}

// 格式化文件大小
function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
}

// 递归获取目录下所有文件
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir)

  files.forEach(file => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList)
    } else {
      fileList.push({
        path: filePath,
        relativePath: path.relative(distDir, filePath),
        size: stat.size,
        ext: path.extname(file),
      })
    }
  })

  return fileList
}

// 分析构建产物
function analyzeBuild() {
  console.log('📊 分析构建产物...\n')

  if (!fs.existsSync(distDir)) {
    console.error('❌ dist 目录不存在，请先执行 pnpm build')
    process.exit(1)
  }

  const files = getAllFiles(distDir)
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)

  // 按文件类型分组
  const byExtension = {}
  files.forEach(file => {
    const ext = file.ext || 'no-ext'
    if (!byExtension[ext]) {
      byExtension[ext] = { count: 0, size: 0, files: [] }
    }
    byExtension[ext].count++
    byExtension[ext].size += file.size
    byExtension[ext].files.push(file)
  })

  // 打印总体统计
  console.log('📦 总体统计')
  console.log('━'.repeat(60))
  console.log(`总文件数: ${files.length}`)
  console.log(`总大小: ${formatSize(totalSize)}`)
  console.log()

  // 打印各类型文件统计
  console.log('📁 文件类型分布')
  console.log('━'.repeat(60))
  const sortedExts = Object.entries(byExtension).sort((a, b) => b[1].size - a[1].size)

  sortedExts.forEach(([ext, data]) => {
    const percentage = ((data.size / totalSize) * 100).toFixed(1)
    console.log(`${ext.padEnd(15)} ${data.count.toString().padStart(5)} 个  ${formatSize(data.size).padStart(12)}  (${percentage}%)`)
  })
  console.log()

  // 打印最大的文件
  console.log('📈 最大的 10 个文件')
  console.log('━'.repeat(60))
  const sortedFiles = files.sort((a, b) => b.size - a.size).slice(0, 10)
  sortedFiles.forEach(file => {
    console.log(`${formatSize(file.size).padStart(12)}  ${file.relativePath}`)
  })
  console.log()

  // 字体文件分析
  const fontFiles = files.filter(f => /\.(woff2?|ttf|otf|eot)$/i.test(f.ext))
  if (fontFiles.length > 0) {
    const fontSize = fontFiles.reduce((sum, f) => sum + f.size, 0)
    console.log('🔤 字体文件分析')
    console.log('━'.repeat(60))
    console.log(`字体文件数: ${fontFiles.length}`)
    console.log(`字体总大小: ${formatSize(fontSize)}`)
    console.log(`占比: ${((fontSize / totalSize) * 100).toFixed(1)}%`)

    // 按字体类型分组
    const fontByName = {}
    fontFiles.forEach(f => {
      const name = path.basename(f.relativePath).split(/[-_]/)[0]
      if (!fontByName[name]) {
        fontByName[name] = { count: 0, size: 0 }
      }
      fontByName[name].count++
      fontByName[name].size += f.size
    })

    console.log('\n字体系列分布:')
    Object.entries(fontByName)
      .sort((a, b) => b[1].size - a[1].size)
      .forEach(([name, data]) => {
        console.log(`  ${name.padEnd(25)} ${data.count.toString().padStart(3)} 个  ${formatSize(data.size).padStart(10)}`)
      })
    console.log()
  }

  // 优化建议
  console.log('💡 优化建议')
  console.log('━'.repeat(60))

  if (fontFiles.length > 50) {
    console.log('⚠️  字体文件过多 (' + fontFiles.length + ' 个)，建议:')
    console.log('   - 只加载必要的字体子集（如 latin）')
    console.log('   - 移除未使用的字体变体')
    console.log()
  }

  const largeFiles = files.filter(f => f.size > 100 * 1024) // > 100KB
  if (largeFiles.length > 0) {
    console.log('⚠️  发现大文件 (> 100KB):')
    largeFiles.forEach(f => {
      console.log(`   ${formatSize(f.size).padStart(10)}  ${f.relativePath}`)
    })
    console.log()
  }

  const htmlFiles = files.filter(f => f.ext === '.html')
  const largeHtml = htmlFiles.filter(f => f.size > 50 * 1024)
  if (largeHtml.length > 0) {
    console.log('⚠️  HTML 文件过大 (> 50KB):')
    largeHtml.forEach(f => {
      console.log(`   ${formatSize(f.size).padStart(10)}  ${f.relativePath}`)
    })
    console.log('   建议启用 HTML 压缩和代码分割')
    console.log()
  }

  console.log('✅ 分析完成！')
}

analyzeBuild()
