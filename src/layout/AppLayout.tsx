import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { CanvasArea } from "@/layout/CanvasArea"
import { Header } from "@/layout/Header"
import { Sidebar } from "@/layout/Sidebar"
import { WorkArea } from "@/layout/WorkArea"

export function AppLayout() {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar />
      <SidebarInset className="min-h-0 overflow-hidden">
        <Header />
        {/* The resizable split was dropped: the canvas width is derived from its
            9:16 ratio, so the work area simply takes whatever is left. */}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-hidden">
            <WorkArea />
          </div>
          <CanvasArea />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
