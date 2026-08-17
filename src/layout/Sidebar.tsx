import * as React from "react"

import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarRail,
} from "@/components/ui/sidebar"
import { AddProjectButton } from "@/features/projects/AddProjectButton"
import { ProjectsNav } from "@/features/projects/ProjectsNav"

export function Sidebar({
  ...props
}: React.ComponentProps<typeof SidebarPrimitive>) {
  return (
    <SidebarPrimitive collapsible="icon" {...props}>
      <SidebarContent>
        <ProjectsNav />
        <AddProjectButton />
      </SidebarContent>
      <SidebarRail />
    </SidebarPrimitive>
  )
}
