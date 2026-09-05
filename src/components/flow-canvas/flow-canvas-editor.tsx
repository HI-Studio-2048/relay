"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import { NodeInspector, type FlowMeta, type InspectorField } from "@/components/flow-canvas/node-inspector";
import { NodePalette } from "@/components/flow-canvas/node-palette";
import { flowNodeTypes } from "@/components/flow-canvas/nodes";
import {
  TRIGGER_NODE_ID,
  canvasToDefinition,
  createCanvasNode,
  definitionToCanvas,
  isValidCanvasConnection,
  replaceHandleEdge,
  validateCanvas,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeKind,
} from "@/lib/flow-canvas";
import type { FlowDefinition } from "@/lib/types";

export type FlowCanvasHandle = {
  getDefinition: () => FlowDefinition;
  getValidation: () => ReturnType<typeof validateCanvas>;
};

type RfNode = Node<CanvasNodeData, CanvasNodeKind>;

function toRf(graph: ReturnType<typeof definitionToCanvas>): { nodes: RfNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      deletable: node.id !== TRIGGER_NODE_ID,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
  };
}

function fromRf(nodes: RfNode[], edges: Edge[]): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: (node.type ?? "message") as CanvasNodeKind,
      position: node.position,
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? "out",
      targetHandle: edge.targetHandle ?? "in",
    })),
  };
}

function CanvasStage({
  initialDefinition,
  meta,
  customFields,
  tagNames,
  onMetaChange,
  canvasRef,
}: {
  initialDefinition: FlowDefinition;
  meta: FlowMeta;
  customFields: InspectorField[];
  tagNames: string[];
  onMetaChange: (patch: Partial<FlowMeta>) => void;
  canvasRef: React.Ref<FlowCanvasHandle>;
}) {
  const seed = useMemo(() => toRf(definitionToCanvas(initialDefinition)), [initialDefinition]);
  const [nodes, setNodes, onNodesChange] = useNodesState(seed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(seed.edges);
  const [selectedId, setSelectedId] = useState<string | null>(TRIGGER_NODE_ID);
  const { screenToFlowPosition } = useReactFlow();

  const graph = useCallback(() => fromRf(nodes, edges), [nodes, edges]);

  useImperativeHandle(
    canvasRef,
    () => ({
      getDefinition: () => canvasToDefinition(graph()),
      getValidation: () => validateCanvas(graph()),
    }),
    [graph],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidCanvasConnection(connection) || !connection.source || !connection.target) return;
      setEdges((current) => {
        const mapped = current.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? "out",
          targetHandle: edge.targetHandle ?? "in",
        }));
        return replaceHandleEdge(mapped, {
          source: connection.source!,
          target: connection.target!,
          sourceHandle: connection.sourceHandle ?? "next",
          targetHandle: connection.targetHandle ?? "in",
        });
      });
    },
    [setEdges],
  );

  const addNode = useCallback(
    (kind: Exclude<CanvasNodeKind, "trigger">, position?: { x: number; y: number }) => {
      const created = createCanvasNode(
        kind,
        position ?? screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
      );
      const node: RfNode = {
        id: created.id,
        type: created.type,
        position: created.position,
        data: created.data,
      };
      setNodes((current) => [...current, node]);
      setSelectedId(created.id);
    },
    [screenToFlowPosition, setNodes],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/relay-node") as Exclude<
        CanvasNodeKind,
        "trigger"
      >;
      if (!kind) return;
      addNode(kind, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addNode, screenToFlowPosition],
  );

  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  const onDataChange = (id: string, data: CanvasNodeData) => {
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, data } : node)));
    if (data.kind === "buttons") {
      const handles = new Set(data.buttons.map((button) => button.id));
      setEdges((current) =>
        current.filter((edge) => edge.source !== id || !edge.sourceHandle?.startsWith("btn-") || handles.has(edge.sourceHandle)),
      );
    }
  };

  const onDelete = (id: string) => {
    if (id === TRIGGER_NODE_ID) return;
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedId(TRIGGER_NODE_ID);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <NodePalette onAdd={(kind) => addNode(kind)} />
      <div className="relative min-h-[52vh] min-w-0 flex-1 md:min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          nodeTypes={flowNodeTypes}
          onSelectionChange={({ nodes: selectedNodes }) => {
            setSelectedId(selectedNodes[0]?.id ?? null);
          }}
          isValidConnection={isValidCanvasConnection}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode={["Backspace", "Delete"]}
          onBeforeDelete={async ({ nodes: pending, edges: pendingEdges }) => {
            const keep = pending.filter((node) => node.id !== TRIGGER_NODE_ID);
            if (keep.length === 0) return false;
            return { nodes: keep, edges: pendingEdges };
          }}
          proOptions={{ hideAttribution: false }}
          className="relay-flow"
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--border)" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            className="!bg-card !shadow-none"
            nodeColor={(node) => {
              if (node.type === "trigger") return "var(--primary)";
              if (node.type === "capture") return "#34d399";
              if (node.type === "buttons") return "#a78bfa";
              if (node.type === "media") return "#fb7185";
              if (node.type === "tag") return "#fbbf24";
              if (node.type === "end") return "#6b7280";
              return "#7dd3fc";
            }}
          />
        </ReactFlow>
      </div>
      <NodeInspector
        selectedId={selected?.id ?? selectedId}
        data={selected?.data ?? null}
        meta={meta}
        customFields={customFields}
        tagNames={tagNames}
        onMetaChange={onMetaChange}
        onDataChange={onDataChange}
        onDelete={onDelete}
      />
    </div>
  );
}

export const FlowCanvasEditor = forwardRef<
  FlowCanvasHandle,
  {
    initialDefinition: FlowDefinition;
    meta: FlowMeta;
    customFields: InspectorField[];
    tagNames: string[];
    onMetaChange: (patch: Partial<FlowMeta>) => void;
  }
>(function FlowCanvasEditor(props, ref) {
  return (
    <ReactFlowProvider>
      <CanvasStage {...props} canvasRef={ref} />
    </ReactFlowProvider>
  );
});

export default FlowCanvasEditor;
