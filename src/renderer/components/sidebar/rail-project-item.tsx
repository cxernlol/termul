import { memo } from 'react'
import { useProjectDiffStat } from '../shell/ProjectDiffStat'
import { ProjectItem, type ProjectItemProps } from './project-item'

/**
 * Project row of the shell Rail: the project row plus its uncommitted diff
 * stat. The row watches its working copy in the git-status store while mounted
 * and shows nothing when there is no stat to show.
 */
export const RailProjectItem = memo(function RailProjectItem(
  props: Omit<ProjectItemProps, 'diffStat'>
): React.JSX.Element {
  const diffStat = useProjectDiffStat(props.project, true)
  return <ProjectItem {...props} diffStat={diffStat} />
})
