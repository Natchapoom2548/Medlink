import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Page, Sub, T } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { thaiDate } from '../src/domain/utils';

export default function NurseActions() {
  const { kind = 'request_return' } = useLocalSearchParams<{ kind?: string }>();
  const { profile, data } = useApp();
  if (!profile || profile.role !== 'nurse') return <Page title="ไม่มีสิทธิ์ทำรายการ" back />;
  const action = kind === 'report_equipment' ? 'report' : 'request_return';
  const loans = data.loans.filter((loan) => loan.borrower_id === profile.id && loan.status === 'approved');
  return <Page title={action === 'report' ? 'รายงานเครื่องมีปัญหา' : 'แจ้งขอคืนเครื่อง'} back>
    <Sub>{action === 'report' ? 'เลือกเครื่องที่กำลังยืมเพื่อแจ้งอาการให้ BME' : 'เลือกเครื่องเพื่อแจ้ง BME ว่าต้องการคืน โดยสถานะจะยังคงเป็นกำลังยืมจนกว่าจะตรวจรับจริง'}</Sub>
    {loans.map((loan) => {
      const equipment = data.equipment.find((item) => item.id === loan.equipment_id);
      if (!equipment) return null;
      return <Card key={loan.id}>
        <T>{equipment.code} • {equipment.name_th || equipment.name}</T>
        <Sub>{loan.department} {loan.bed_room} • กำหนดคืน {thaiDate(loan.return_date)}</Sub>
        {action === 'request_return' && loan.return_requested_at ? <Sub>แจ้ง BME แล้ว • {thaiDate(loan.return_requested_at)}</Sub> : null}
        <Button title={action === 'report' ? 'รายงานปัญหาเครื่องนี้' : loan.return_requested_at ? 'แจ้ง BME แล้ว' : 'แจ้งขอคืนเครื่อง'} secondary={!!loan.return_requested_at} disabled={!!loan.return_requested_at && action === 'request_return'} onPress={() => router.push({ pathname: '/workflow', params: { kind: action === 'report' ? 'report' : 'request_return', id: equipment.id } })} />
      </Card>;
    })}
    {!loans.length && <Card><T>ไม่มีเครื่องมือที่กำลังยืม</T><Sub>เมนูนี้ใช้ได้กับเครื่องที่ยืมอยู่ในบัญชีของคุณ</Sub></Card>}
  </Page>;
}
