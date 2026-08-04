import test from 'node:test';
import assert from 'node:assert/strict';
import { describeConfigError, formatConfigErrors } from '../public/js/shared/error-format.js';

const endpoints = [
  { id: 'ep_1', name: 'Tra cứu thuê bao', pathTemplate: '/query/abc/{*}' },
  { id: 'ep_2', name: '', pathTemplate: '/query/other' },
];

test('describeConfigError them so thu tu va ten endpoint', () => {
  const err = { field: 'endpoint:ep_1', message: 'Method GET không gửi được body.' };
  assert.equal(
    describeConfigError(err, endpoints),
    'Endpoint #1 "Tra cứu thuê bao": Method GET không gửi được body.',
  );
});

test('describeConfigError dung pathTemplate khi endpoint chua co ten', () => {
  const err = { field: 'endpoint:ep_2', message: 'Path sai' };
  assert.equal(describeConfigError(err, endpoints), 'Endpoint #2 "/query/other": Path sai');
});

test('describeConfigError giu nguyen message khi field khong phai endpoint', () => {
  const err = { field: 'domain', message: 'Domain phải bắt đầu bằng http://' };
  assert.equal(describeConfigError(err, endpoints), 'Domain phải bắt đầu bằng http://');
});

test('describeConfigError khong tim thay id van bao ro id de truy vet', () => {
  const err = { field: 'endpoint:ep_deleted', message: 'Loi con sot lai' };
  assert.equal(describeConfigError(err, endpoints), 'Endpoint ep_deleted: Loi con sot lai');
});

test('formatConfigErrors noi nhieu loi thanh danh sach gach dau dong', () => {
  const errors = [
    { field: 'domain', message: 'Domain sai' },
    { field: 'endpoint:ep_1', message: 'Method GET không gửi được body.' },
  ];
  assert.equal(
    formatConfigErrors(errors, endpoints),
    '• Domain sai\n• Endpoint #1 "Tra cứu thuê bao": Method GET không gửi được body.',
  );
});

test('formatConfigErrors tra ve chuoi rong khi khong co loi', () => {
  assert.equal(formatConfigErrors([], endpoints), '');
  assert.equal(formatConfigErrors(undefined, endpoints), '');
});
