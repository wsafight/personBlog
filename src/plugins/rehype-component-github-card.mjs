/// <reference types="mdast" />
import { h } from 'hastscript'

/**
 * Creates a GitHub Card component.
 *
 * @param {Object} properties - The properties of the component.
 * @param {string} properties.repo - The GitHub repository in the format "owner/repo".
 * @param {import('mdast').RootContent[]} children - The children elements of the component.
 * @returns {import('mdast').Parent} The created GitHub Card component.
 */
export function GithubCardComponent(properties, children) {
  if (Array.isArray(children) && children.length !== 0)
    return h('div', { class: 'hidden' }, [
      'Invalid directive. ("github" directive must be leaf type "::github{repo="owner/repo"}")',
    ])

  if (!properties.repo || !properties.repo.includes('/'))
    return h(
      'div',
      { class: 'hidden' },
      'Invalid repository. ("repo" attributte must be in the format "owner/repo")',
    )

  const repo = properties.repo
  const cardUuid = `GC${Math.random().toString(36).slice(-6)}` // Collisions are not important

  const nAvatar = h(`div#${cardUuid}-avatar`, { class: 'gc-avatar' })
  const nLanguage = h(
    `span#${cardUuid}-language`,
    { class: 'gc-language' },
    'Waiting...',
  )

  const nTitle = h(`div`, { class: 'gc-titlebar' }, [
    h('div', { class: 'gc-titlebar-left' }, [
      h('div', { class: 'gc-owner' }, [
        nAvatar,
        h('div', { class: 'gc-user' }, repo.split('/')[0]),
      ]),
      h('div', { class: 'gc-divider' }, '/'),
      h('div', { class: 'gc-repo' }, repo.split('/')[1]),
    ]),
    h('div', { class: 'github-logo' }),
  ])

  const nDescription = h(
    `div#${cardUuid}-description`,
    { class: 'gc-description' },
    'Waiting for api.github.com...',
  )

  const nStars = h(`div#${cardUuid}-stars`, { class: 'gc-stars' }, '00K')
  const nForks = h(`div#${cardUuid}-forks`, { class: 'gc-forks' }, '0K')
  const nLicense = h(`div#${cardUuid}-license`, { class: 'gc-license' }, '0K')

  const nScript = h(
    `script#${cardUuid}-script`,
    { type: 'text/javascript', defer: true },
    `
      const repo${cardUuid} = '${repo}';
      const uuid${cardUuid} = '${cardUuid}';
      getGitRepoInfoThenRenderCard(repo${cardUuid}, uuid${cardUuid})
    `,
  )

  return h(
    `a#${cardUuid}-card`,
    {
      class: 'card-github fetch-waiting no-styling',
      href: `https://github.com/${repo}`,
      target: '_blank',
      repo,
    },
    [
      nTitle,
      nDescription,
      h('div', { class: 'gc-infobar' }, [nStars, nForks, nLicense, nLanguage]),
      nScript,
    ],
  )
}
