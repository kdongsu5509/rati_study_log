import { QuartzFilterPlugin } from "../types"

export const RemoveRawTitles: QuartzFilterPlugin<{}> = () => ({
  name: "RemoveRawTitles",
  shouldPublish(_ctx, [_tree, vfile]) {
    const title = vfile.data?.frontmatter?.title ?? ""
    return !title.toLowerCase().includes("raw")
  },
})
