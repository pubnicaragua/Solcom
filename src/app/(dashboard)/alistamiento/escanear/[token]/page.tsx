import WarehouseSerialScanner from '@/components/warehouse-scanner/WarehouseSerialScanner';

type ScannerPageProps = {
  params: {
    token: string;
  };
};

export default function ScannerPage({ params }: ScannerPageProps) {
  return <WarehouseSerialScanner token={params.token} />;
}
