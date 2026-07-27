-- AlterTable
ALTER TABLE "picking_tasks" ADD COLUMN     "assignedUserId" INTEGER;

-- CreateIndex
CREATE INDEX "picking_tasks_status_assignedUserId_idx" ON "picking_tasks"("status", "assignedUserId");

-- AddForeignKey
ALTER TABLE "picking_tasks" ADD CONSTRAINT "picking_tasks_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
