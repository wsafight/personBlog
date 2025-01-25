import { LinkPreset, type NavBarLink } from '@/types/config'

export const LinkPresets: { [key in LinkPreset]: NavBarLink } = {
  [LinkPreset.Home]: {
    name: '主页',
    url: '/',
  },
  [LinkPreset.About]: {
    name: '关于',
    url: '/about/',
  },
  [LinkPreset.Products]: {
    name: '作品',
    url: '/products/',
  },
  [LinkPreset.Archive]: {
    name: '归档',
    url: '/archive/',
  },
}
