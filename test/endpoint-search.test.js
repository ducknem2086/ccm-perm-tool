import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesEndpointSearch } from '../public/js/shared/endpoint-search.js';

test('matchesEndpointSearch khop theo name', () => {
  const ep = { name: 'Tra cứu thuê bao', pathTemplate: '/query/abc' };
  assert.equal(matchesEndpointSearch(ep, 'thuê bao'), true);
});

test('matchesEndpointSearch khop theo pathTemplate', () => {
  const ep = { name: 'X', pathTemplate: '/query/abc-information/{*}' };
  assert.equal(matchesEndpointSearch(ep, 'abc-information'), true);
});

test('matchesEndpointSearch khong phan biet hoa thuong', () => {
  const ep = { name: 'Tra Cuu Thue Bao', pathTemplate: '/query/abc' };
  assert.equal(matchesEndpointSearch(ep, 'TRA CUU'), true);
});

test('matchesEndpointSearch trim khoang trang o ca gia tri luu lan query go', () => {
  const ep = { name: '  Tra cứu  ', pathTemplate: '/query/abc' };
  assert.equal(matchesEndpointSearch(ep, '  tra cứu  '), true);
});

test('matchesEndpointSearch khong khop tra ve false', () => {
  const ep = { name: 'Tra cứu thuê bao', pathTemplate: '/query/abc' };
  assert.equal(matchesEndpointSearch(ep, 'khong-ton-tai'), false);
});

test('matchesEndpointSearch query rong luon khop', () => {
  const ep = { name: 'Bat ky', pathTemplate: '/query/abc' };
  assert.equal(matchesEndpointSearch(ep, ''), true);
  assert.equal(matchesEndpointSearch(ep, '   '), true);
});

test('matchesEndpointSearch chiu duoc endpoint thieu name', () => {
  const ep = { pathTemplate: '/query/abc' };
  assert.equal(matchesEndpointSearch(ep, 'abc'), true);
  assert.equal(matchesEndpointSearch(ep, 'khong-co'), false);
});
