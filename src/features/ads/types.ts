export type AdPlacement =
  | 'today_after_tasks'
  | 'schedule_bottom'
  | 'lists_bottom'
  | 'done_bottom';

export type MockAd = {
  id: string;
  title: string;
  body: string;
  sponsor: string;
  cta: string;
};
