import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { create, act } from 'react-test-renderer';
import KPIGrid from '../../src/components/dashboard/KPIGrid';

function textOf(tree: any): string {
  if (tree == null) return '';
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(textOf).join(' ');
  return textOf(tree.children);
}

test('KPIs finish loading when search cancels the initial unfiltered pivot request', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({totalSKUs:2290,totalProducts:2290,totalStock:17006,totalValue:0,activeWarehouses:15,lastSync:'02 nov 2026'}));
  let view: any;
  try {
    await act(async () => { view = create(<KPIGrid pivotData={null} needsSummary />); });
    assert.match(textOf(view.toJSON()), /17[,.]006/);
    assert.doesNotMatch(textOf(view.toJSON()), /\.\.\./);
  } finally {
    if (view) act(() => view.unmount());
    globalThis.fetch = originalFetch;
  }
});

test('summary failure stops the indefinite loading indicator', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', {status:500});
  let view: any;
  try {
    await act(async () => { view = create(<KPIGrid pivotData={null} needsSummary />); });
    assert.doesNotMatch(textOf(view.toJSON()), /\.\.\./);
    assert.match(textOf(view.toJSON()), /—/);
  } finally {
    if (view) act(() => view.unmount());
    globalThis.fetch = originalFetch;
  }
});

test('unfiltered pivot data supplies KPIs without a duplicate summary request', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected duplicate fetch'); };
  let view: any;
  try {
    await act(async () => { view = create(<KPIGrid pivotData={{ items: [], warehouses: [], totalBeforeFilter:0, totalSkuCount:0 } as any} />); });
    assert.doesNotMatch(textOf(view.toJSON()), /\.\.\./);
    assert.equal(requests, 0);
  } finally {
    if (view) act(() => view.unmount());
    globalThis.fetch = originalFetch;
  }
});


test('a late summary cannot overwrite newer unfiltered pivot data', async () => {
  const originalFetch = globalThis.fetch;
  let resolveSummary!: (response: Response) => void;
  globalThis.fetch = () => new Promise<Response>(resolve => { resolveSummary = resolve; });
  let view: any;
  const pivot = {items:[{sku:'TEST', total:19, price:0}], warehouses:[{code:'X1',name:'X1'}], totalBeforeFilter:1, totalSkuCount:1} as any;
  try {
    await act(async () => { view = create(<KPIGrid pivotData={null} needsSummary />); });
    await act(async () => { view.update(<KPIGrid pivotData={pivot} needsSummary />); });
    await act(async () => { resolveSummary(new Response(JSON.stringify({totalSKUs:999,totalProducts:999,totalStock:999,totalValue:0,activeWarehouses:999,lastSync:'old'}))); });
    const values = view.root.findAll((node: any) => node.props.className === 'kpi-value').map((node: any) => node.children.join(''));
    assert.equal(values[3], '19');
    assert.equal(values[0], '1');
  } finally {
    if (view) act(() => view.unmount());
    globalThis.fetch = originalFetch;
  }
});
