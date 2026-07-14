
-- AlterTable
ALTER TABLE "accounts" ALTER COLUMN "total_cash" SET DATA TYPE DECIMAL(20,4),
ALTER COLUMN "available_cash" SET DATA TYPE DECIMAL(20,4),
ALTER COLUMN "blocked_cash" SET DATA TYPE DECIMAL(20,4),
ALTER COLUMN "unsettled_cash" SET DATA TYPE DECIMAL(20,4);

-- AlterTable
ALTER TABLE "instruments" ALTER COLUMN "tick_size" SET DATA TYPE DECIMAL(12,6),
ALTER COLUMN "face_value" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "coupon_rate" SET DATA TYPE DECIMAL(9,6),
ALTER COLUMN "last_price" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "holdings" ALTER COLUMN "total_quantity" SET DATA TYPE DECIMAL(24,8),
ALTER COLUMN "available_quantity" SET DATA TYPE DECIMAL(24,8),
ALTER COLUMN "blocked_quantity" SET DATA TYPE DECIMAL(24,8),
ALTER COLUMN "unsettled_quantity" SET DATA TYPE DECIMAL(24,8),
ALTER COLUMN "average_cost" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(24,8),
ALTER COLUMN "price" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "estimated_gross" SET DATA TYPE DECIMAL(20,4),
ALTER COLUMN "estimated_fees" SET DATA TYPE DECIMAL(20,4),
ALTER COLUMN "estimated_net" SET DATA TYPE DECIMAL(20,4);

-- AlterTable
ALTER TABLE "trades" ALTER COLUMN "execution_price" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "quantity_filled" SET DATA TYPE DECIMAL(24,8),
ALTER COLUMN "gross_amount" SET DATA TYPE DECIMAL(20,4),
ALTER COLUMN "fees" SET DATA TYPE DECIMAL(20,4),
ALTER COLUMN "net_amount" SET DATA TYPE DECIMAL(20,4);

-- AlterTable
ALTER TABLE "cash_ledger_entries" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(20,4),
ALTER COLUMN "running_balance" SET DATA TYPE DECIMAL(20,4);

-- AlterTable
ALTER TABLE "securities_ledger_entries" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(24,8),
ALTER COLUMN "running_quantity" SET DATA TYPE DECIMAL(24,8);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor_id" TEXT,
    "reason" TEXT,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
