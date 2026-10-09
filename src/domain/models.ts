export type Role = 'nurse' | 'bme' | 'technician';
export type Status = 'ready' | 'pending_borrow' | 'borrowed' | 'pm_due' | 'repair' | 'reject';
export interface Profile {
  id: string;
  email: string;
  staff_id: string;
  name: string;
  role: Role;
  department: string;
  hospital: string;
  phone: string;
  active: boolean;
  avatar_path: string | null;
}
export interface Equipment {
  id: string;
  code: string;
  name: string;
  name_th: string;
  category: string;
  brand: string;
  model: string;
  serial_number: string;
  department: string;
  location: string;
  building: string;
  floor: string;
  bay: string;
  status: Status;
  last_pm_date: string | null;
  due_date: string | null;
  image_path: string | null;
  notes: string;
  revision: number;
}
export interface Loan {
  id: string;
  equipment_id: string;
  borrower_id: string;
  department: string;
  bed_room: string;
  borrow_date: string;
  return_date: string;
  notes: string;
  status: 'pending' | 'approved' | 'rejected' | 'returned';
  return_requested_at?: string | null;
  issue_reported_at?: string | null;
  issue_received_at?: string | null;
  created_at: string;
}
export interface PmTask {
  id: string;
  equipment_id: string;
  assigned_by: string;
  assigned_to: string;
  mode: string;
  target_date: string;
  location: string;
  priority: string;
  notes: string;
  status: 'assigned' | 'accepted' | 'submitted' | 'rejected' | 'completed';
  result: 'PASS' | 'CONDITIONAL' | null;
  inspection_date: string | null;
  due_date: string | null;
  document_path: string | null;
  checks: Record<string, boolean> | null;
  accepted_at: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string;
}
export interface Activity {
  id: string;
  equipment_id: string;
  actor_id: string;
  subject_id: string | null;
  action: string;
  notes: string;
  created_at: string;
}
export interface Notice {
  id: string;
  title: string;
  body: string;
  equipment_id: string | null;
  conversation_id: string | null;
  read_at: string | null;
  created_at: string;
}
export interface Conversation {
  id: string;
  owner_id: string;
  owner_name: string;
  created_at: string;
}
export interface Attachment {
  id: string;
  path: string;
  name: string;
  mime_type: string;
  equipment_id: string | null;
  conversation_id: string | null;
  is_avatar: boolean;
}
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  attachment_id: string | null;
  created_at: string;
}
export interface Receipt {
  conversation_id: string;
  user_id: string;
  read_at: string;
}
export interface Snapshot {
  profiles: Profile[];
  equipment: Equipment[];
  loans: Loan[];
  pm_tasks: PmTask[];
  activities: Activity[];
  favorites: { equipment_id: string }[];
  notifications: Notice[];
  conversations: Conversation[];
  attachments: Attachment[];
  messages: Message[];
  conversation_reads: Receipt[];
}
export const emptySnapshot = (): Snapshot => ({
  profiles: [],
  equipment: [],
  loans: [],
  pm_tasks: [],
  activities: [],
  favorites: [],
  notifications: [],
  conversations: [],
  attachments: [],
  messages: [],
  conversation_reads: [],
});
export type Action =
  | 'request_borrow'
  | 'approve_borrow'
  | 'reject_borrow'
  | 'return_equipment'
  | 'request_return'
  | 'set_status'
  | 'dispatch_pm'
  | 'complete_pm'
  | 'accept_pm'
  | 'submit_pm'
  | 'approve_pm'
  | 'reject_pm'
  | 'report_equipment'
  | 'dispatch_repair_pickup'
  | 'confirm_repair_pickup'
  | 'receive_reported_equipment'
  | 'add_equipment'
  | 'equipment_image'
  | 'edit_profile'
  | 'open_chat'
  | 'register_attachment'
  | 'send_message';
export const roleLabels: Record<Role, string> = {
  nurse: 'พยาบาล',
  bme: 'วิศวกร BME',
  technician: 'ช่างเทคนิค',
};
export const statusLabels: Record<Status, string> = {
  ready: 'พร้อมใช้งาน',
  pending_borrow: 'รออนุมัติ',
  borrowed: 'กำลังยืม',
  pm_due: 'รอ PM',
  repair: 'ไม่พร้อมใช้งาน',
  reject: 'งดใช้งาน',
};
export const actionLabels: Record<string, string> = {
  request_borrow: 'ส่งคำขอยืม',
  approve_borrow: 'อนุมัติยืมและนำส่ง',
  reject_borrow: 'ปฏิเสธคำขอยืม',
  return_equipment: 'สแกนรับคืน',
  request_return: 'แจ้งขอคืนเครื่อง',
  set_status: 'เปลี่ยนสถานะ',
  dispatch_pm: 'มอบหมายงาน PM',
  complete_pm: 'บันทึกผล PM',
  accept_pm: 'รับงาน PM',
  submit_pm: 'ส่งผล IPM ให้ BME',
  approve_pm: 'อนุมัติผล IPM',
  reject_pm: 'ส่งผล IPM กลับแก้ไข',
  receive_reported_equipment: 'รับเครื่องที่มีปัญหา',
  report_equipment: 'รายงานเครื่องขัดข้อง',
  add_equipment: 'เพิ่มเครื่องมือ',
  equipment_image: 'เปลี่ยนภาพเครื่องมือ',
};
