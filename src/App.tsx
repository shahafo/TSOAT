import { TooltipProvider } from "@/components/ui/tooltip"
import { ProjectsProvider } from "@/features/projects/ProjectsProvider"
import { RacePreviewProvider } from "@/features/races/RacePreviewProvider"
import { AppLayout } from "@/layout/AppLayout"

function App() {
  return (
    <TooltipProvider>
      <ProjectsProvider>
        <RacePreviewProvider>
          <AppLayout />
        </RacePreviewProvider>
      </ProjectsProvider>
    </TooltipProvider>
  )
}

export default App
