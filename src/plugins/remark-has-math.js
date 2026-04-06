import { visit } from 'unist-util-visit'

export function remarkHasMath() {
  return (tree, { data }) => {
    let hasMath = false
    visit(tree, ['math', 'inlineMath'], () => {
      hasMath = true
      return false // stop traversal
    })
    data.astro.frontmatter.hasMath = hasMath
  }
}
