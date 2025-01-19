import { siteConfig } from '../config'
import type I18nKey from './i18nKey'
import { zh_CN } from './languages/zh_CN'

export type Translation = {
  [K in I18nKey]: string
}

const defaultTranslation = zh_CN

const map: { [key: string]: Translation } = {
  zh_cn: zh_CN,
}

export function getTranslation(lang: string): Translation {
  return map[lang.toLowerCase()] || defaultTranslation
}

export function i18n(key: I18nKey): string {
  const lang = siteConfig.lang || 'en'
  return getTranslation(lang)[key]
}
